import { execute } from './index.js';

const args = {
  price_id: process.argv[2]
};

execute(args).then(console.log).catch(console.error);
