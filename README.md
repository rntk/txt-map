sudo docker run -it --rm -v `pwd`:/app -w /app node:22 sh ./build.sh

sudo docker run --rm -it --network=host -v $(pwd):/app --name rsstag-tests rsstag-tests 


cd extension
docker build -t rsstag-extension .
docker run -v $(pwd)/..:/workspace rsstag-extension