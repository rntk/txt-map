# Docker Setup for RSS Content Analysis App

This guide explains how to run the FastAPI RSS Content Analysis application using Docker.

## Prerequisites

- Docker
- Docker Compose

## Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Build and run with Docker Compose**:
   ```bash
   docker-compose up --build
   ```

   This will:
   - Build the FastAPI application
   - Start MongoDB database
   - Expose the API on `http://localhost:8000`

3. **Access the application**:
   - API Documentation: http://localhost:8000/docs
   - Themed Posts Page: http://localhost:8000/page/themed-post
   - Clustered Posts Page: http://localhost:8000/page/clustered-post

## Manual Docker Build

If you prefer to build and run manually:

1. **Build the Docker image**:
   ```bash
   docker build -t rss-content-analyzer .
   ```

2. **Run MongoDB separately**:
   ```bash
   docker run -d --name mongodb -p 27017:27017 -e MONGO_INITDB_DATABASE=rss mongo:7.0
   ```

3. **Run the application**:
   ```bash
   docker run -d --name rss-app -p 8000:8000 \
     -e MONGODB_URL=mongodb://host.docker.internal:27017/ \
     --link mongodb:mongodb \
     rss-content-analyzer
   ```

## Environment Variables

The application supports the following environment variables:

- `MONGODB_URL`: MongoDB connection string (default: `mongodb://localhost:8765/`)

## LlamaCPP Integration

The application expects a LlamaCPP server running on `http://127.0.0.1:8989`. For Docker deployment:

1. **Uncomment the LlamaCPP service** in `docker-compose.yml`
2. **Add your model** to a `models` directory
3. **Update the model path** in the compose file
4. **Modify the application code** to use `http://llamacpp:8080` instead of `127.0.0.1:8989`

## Data Persistence

MongoDB data is persisted using Docker volumes. The database will retain data between container restarts.

## Development

For development with hot reloading:

```bash
# Run only MongoDB
docker-compose up mongodb

# Run the app locally with auto-reload
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Troubleshooting

1. **Port conflicts**: If ports 8000 or 27017 are in use, modify the port mappings in `docker-compose.yml`

2. **MongoDB connection issues**: Ensure the `MONGODB_URL` environment variable matches your MongoDB setup

3. **Frontend not loading**: The frontend is built during the Docker image creation. If you modify frontend files, rebuild the image:
   ```bash
   docker-compose up --build
   ```

4. **LlamaCPP connection errors**: Make sure your LlamaCPP server is accessible and update the URL in the handler files if needed

## Production Considerations

For production deployment:

1. Use environment-specific configuration files
2. Set up proper MongoDB authentication
3. Use secrets management for sensitive data
4. Configure proper logging and monitoring
5. Set up SSL/TLS termination
6. Use a production-grade LLM inference server


sudo docker build -t rsstag-tests -f Dockerfile.web ./
sudo docker run --rm -it --network=host -v $(pwd):/app --name rsstag-tests rsstag-tests 