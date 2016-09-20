({urequire: { rootExports: 'ImpressAsqForkAsqAdapter' } });

module.exports = {
  adapter : require('./impressAsqAdapter'),
  thumbGenerator : require('./thumbGenerator'),
  impressThumbGenerator : require('./impressThumbGenerator')
}
