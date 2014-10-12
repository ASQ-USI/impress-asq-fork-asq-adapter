// this is the entry for the ./example/js/impressAsqImpressAdapterExample.js script

//congig logger
require('bows').config({ padLength: 18 })

//fun starts here
var asqSocket = require('./browser/asqSocketMock');
var adapter = require('./browser').adapter(asqSocket);