import { http } from '@google-cloud/functions-framework';
import { handleRequest } from './handleRequest.js';

http('githubEpdProjectAutomation', (req, res) => {
  handleRequest(req, res);
});
