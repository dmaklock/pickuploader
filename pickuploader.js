import express from 'express';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import { Sequelize, Model, DataTypes } from 'sequelize';
import crypto from "crypto";
import moment from "moment";
import { fileTypeFromBuffer } from 'file-type';

import { check, validationResult } from "express-validator";

process.on('uncaughtException', err => {
    console.error('There was an uncaught error', err)
})


const PORT = process.env.PORT || 3000
const ROOT_SECRET = process.env.ROOT_SECRET;
const BUCKET = process.env.BUCKET;
const REGION = process.env.REGION || 'nl-ams';
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET_KEY = process.env.SECRET_KEY;

const missingProperty = !ROOT_SECRET ? 'ROOT_SECRET' : (!BUCKET ? 'BUCKET' : (!SECRET_KEY ? 'SECRET_KEY' : null))
if (missingProperty) {
    console.warn(`Missing env property: ${missingProperty}`)
    process.exit(1)
}

const sequelize = new Sequelize('sqlite:db.sqlite', {
    define: { freezeTableName: true, underscored: true }
});

const app = express()
app.use(express.json())
app.use(bodyParser.urlencoded({ extended: true }));

function responseValidation(req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        let errs = errors.array()
        return res.status(400).json({ err: errs[0].msg, errors: errs })
    }
    next()
}

const tokenValidation = [
    check("key").trim().custom((val) => {
        if ( ! /^[^\/][a-zA-Z0-9_\-\/\.]+[^\/]$/.test(val) ) {
            throw new Error('Wrong key')
        }
        return val
    }),
    responseValidation
]

function randomString() {
    return crypto.randomBytes(20).toString('hex')
}

function createUrl(key) {
    return `https://${BUCKET}.s3.${REGION}.scw.cloud/${key}`;
}

let minioClient = new Minio.Client({
    endPoint: `s3.${REGION}.scw.cloud`,
    useSSL: true,
    region: REGION,
    accessKey: ACCESS_KEY,
    secretKey: SECRET_KEY
});


// DB  -----
const Resource = sequelize.define('Resource', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    key: {
        type: DataTypes.STRING,
        allowNull: false
    },
    tokenId: {
        type: DataTypes.BIGINT,
        allowNull: false
    }
}, { tableName: 'resource' });


const Token = sequelize.define('Token', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    val: DataTypes.STRING,
    key: DataTypes.STRING,
    expireIn: DataTypes.DATE
}, { tableName: 'token' });

sequelize.sync();

// APP ------
app.post('/token', tokenValidation, async (req, res) => {
    if (req.header('x-root-secret') !== ROOT_SECRET) {
        res.status(401).send({ err: 'INVALID_SECRET' })
        return
    }
    const cmd = req.body
    const fileKey = cmd.key
    const token = await Token.create({
        key: fileKey,
        val: randomString(),
        expireIn: moment().add(1, 'hours')
    })
    res.send({
        token: token.val
    })
})

async function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = new Buffer('');
        req.on('data', function(chunk) {
            data = Buffer.concat([data, chunk]);
        });
        req.on('end', function() {
            resolve(data)
        });
    })
}

app.post('/upload', async (req, res) => {
    const tokenVal = req.header('x-token')
    let token = tokenVal ? await Token.findOne({where: { val: tokenVal }}) : null
    if (!token || token.expireIn < moment()) {
        res.status(400).send({ err: 'INVALID_TOKEN' })
        return
    }

    let data = null
    let mimetype = null
    if(req.files && req.files.image && req.files.image.mimetype) {
        data = req.files.image.data;
        mimetype = req.files.image.mimetype;
    } else {
        data = await readRawBody(req)
    }
    
    if (!data) {
        res.status(400).send({ err: 'NO_FILE' })
        return
    }

    let {ext, mime} = await fileTypeFromBuffer(data);
    let fileKey = token.key

    let metaData = {
        'x-amz-acl': 'public-read',
        'Content-Type': mime || mimetype
    };
    minioClient.putObject(BUCKET, fileKey, data, metaData, (err, etag) => {
        if (err) {
            res.send ({ error: 'upload internal error' })
            console.warn(`File ${fileKey} of ${token.id} failed: ${err}`)
        } else {
            Resource.create({ url: fileKey, tokenId: token.id, key: fileKey })
            console.log(`File ${fileKey} uploaded successfully.`)
            res.send ({ key: fileKey, url: createUrl(fileKey) })
        }
    });
})

app.listen(PORT, () => {
    console.log(`server started at ${PORT} port!`)
})

