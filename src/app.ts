import express from 'express';
import bodyParser from 'body-parser';
import { handleRequest } from './handleRequest.js';

const port = parseInt(process.env.PORT || '8080', 10);
const app = express();

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send(`This is a webhook server for syncing Github issues with Github projects. 
Point the webhook to the /webhook endpoint.`);
});

app.post('/webhook', (req, res) => {
  handleRequest(req, res);
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
