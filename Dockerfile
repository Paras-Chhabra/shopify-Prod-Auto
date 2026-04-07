# DigitalOcean App Platform — uses system Chromium for Puppeteer
FROM node:20-slim

# Install Chromium + required fonts/libs for headless browser
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-noto-cjk \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip downloading its own Chromium and use system one
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files AND prisma schema BEFORE npm install
# (needed because postinstall runs "prisma generate" which requires the schema)
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (postinstall will run prisma generate with schema present)
RUN npm install

# Copy the rest of the source code
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
