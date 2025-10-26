sudo docker run -it --rm -v `pwd`:/app -w /app node:22 sh ./build.sh

sudo docker run --rm -it --network=host -v $(pwd):/app --name rsstag-tests rsstag-tests 


cd extension
docker build -t rsstag-extension .
docker run --rm -v $(pwd)/..:/workspace rsstag-extension

docker build -f Dockerfile.cli -t rsstag_tests_cli .

sudo docker run --rm -it --network=host -v $(pwd):/app --name rsstag_tests_cli rsstag_tests_cli get_themed_posts_for_all_tags.py 