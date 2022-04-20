# Pickuploader
Uploader for Scaleway object storage

**Running locally:**\
npm start --root_secret=<MY_OWN_SECRET_KEY> --bucket=<BUCKETNAME> --access-key=<SCALEWAY_OS_KEY> --secret-key=<SCALEWAY_OS_SECRET>

**Running docker:**\
docker run --name=pickuploader -p 3000:3000 -e ROOT_SECRET=<MY_OWN_SECRET_KEY> BUCKET=<BUCKETNAME> ACCESS_KEY=<SCALEWAY_OS_KEY> SECRET_KEY=<SCALEWAY_OS_SECRET> dmaklock/pickuploader
