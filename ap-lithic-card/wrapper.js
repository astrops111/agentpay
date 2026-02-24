import { execute } from './index.js';

const args = {
  amount: process.argv[2]
};

execute(args).then(console.log).catch(console.error);
