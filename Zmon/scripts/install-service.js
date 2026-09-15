const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'ZMon',
  description: 'ZMon - Dashboard de monitoramento de Access Points UniFi',
  script: path.join(__dirname, '..', 'server.js'),
  workingDirectory: path.join(__dirname, '..'),
});

svc.on('install', () => {
  console.log('Serviço ZMon instalado. Iniciando...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Serviço ZMon já está instalado.');
});

svc.on('start', () => {
  console.log('Serviço ZMon iniciado. Acesse http://localhost:3000');
});

svc.on('error', (err) => {
  console.error('Erro ao instalar/iniciar o serviço:', err);
});

svc.install();
