const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'ZMon',
  script: path.join(__dirname, '..', 'server.js'),
});

svc.on('uninstall', () => {
  console.log('Serviço ZMon removido.');
});

svc.on('error', (err) => {
  console.error('Erro ao remover o serviço:', err);
});

svc.uninstall();
