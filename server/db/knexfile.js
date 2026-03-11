const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

module.exports = {
  client: 'better-sqlite3',
  connection: {
    filename: path.resolve(dataDir, 'biomass.db'),
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
  },
};
