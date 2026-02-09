# Instructions for Agents

These instructions are intended for AI agents working on this project.

1.  **Docker Environment**:
    - The project is designed to run within a Docker Compose environment.

2.  **Docker Privileges**:
    - Be aware that running Docker commands may require `sudo` privileges depending on the user's environment.

3.  **Applying Changes**:
    - If you make *any* changes to the codebase or configuration, you **MUST** ask the user to restart the Docker Compose services.
    - Do not attempt to verify or check your changes until the user has confirmed that the services have been restarted.

4.  **How to Test Frontend Changes**:
    - After the user confirms Docker Compose services were restarted, run:
      - `cd /app/frontend && npm test -- --watchAll=false`
      - `cd /app/frontend && npm run test:coverage`
    - Frontend tests should cover safe HTML sanitization and topic/read-unread highlighting behavior.
