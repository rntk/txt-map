# Instructions for Agents

These instructions are intended for AI agents working on this project.

1.  **Docker Environment**:
    - The project is designed to run within a Docker Compose environment.

2.  **Docker Privileges**:
    - Be aware that running Docker commands may require `sudo` privileges depending on the user's environment.

3.  **Applying Changes**:
    - If you make *any* changes to the codebase or configuration, you **MUST** ask the user to restart the Docker Compose services.
    - Do not attempt to verify or check your changes until the user has confirmed that the services have been restarted.

4.  **How to Test Backend Changes**:
    - Run the full backend test suite using Docker (recommended):
      - `./test.sh`                                          # Run all tests
      - `./test.sh -v`                                       # Verbose output
      - `./test.sh tests/unit/test_submission_handler.py -v` # Run a specific test file
      - `./test.sh --cov=. --cov-report=html`               # With HTML coverage report
      - `./test.sh --rebuild`                                # Force rebuild image first (use after changing requirements)
    - To run without Docker (if dependencies are installed locally):
      - `pytest`
      - `pytest tests/unit/test_submission_handler.py -v`
    - To run tests using the local MongoDB binary:
      - `./test_mongodb/start_mongo.sh`                     # Starts MongoDB on port 27017
      - `export MONGODB_URL=mongodb://localhost:27017/`     # Set environment variable
      - `pytest`                                             # Run tests
      - `./test_mongodb/stop_mongo.sh`                      # Stops MongoDB
    - See `TESTING.md` for full details on test structure and writing new tests.

5.  **How to Test Frontend Changes**:
    - After the user confirms Docker Compose services were restarted, run:
      - `cd /app/frontend && npm test -- --watchAll=false`
      - `cd /app/frontend && npm run test:coverage`
    - Frontend tests should cover safe HTML sanitization and topic/read-unread highlighting behavior.
