FROM node:18

WORKDIR /app

# Copy package files first for better caching
COPY package.json yarn.lock ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/
COPY viewer/package.json ./viewer/

# Install dependencies (cached unless package.json changes)
RUN yarn install --network-timeout 600000

# Copy the rest of the application
COPY . ./

EXPOSE 3000
EXPOSE 4001
EXPOSE 4000

CMD sh -c "yarn dev"
