FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PATH="/app/node_modules/.bin:$PATH"

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
