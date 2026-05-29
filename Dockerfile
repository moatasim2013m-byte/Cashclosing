# Use the lighter Alpine image to prevent memory crashes
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy all files
COPY . .

# Build the Frontend (Vite)
RUN npm run build

# Start the Backend
EXPOSE 8080
CMD ["node", "server.js"]