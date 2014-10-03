impress-asq-fork-asq-adapter
===
This adapter adds impress.js presentation support for the ASQ fork of impress.js to ASQ. The adapter has a server-side script: `impress-asq-adapter.js`; and a client-side script: `browser/impress-asq-adapter.js`. An [./example](./example/) folder is included that uses a mock of `asqSocket` to route events back to the adapter. 

Debug
------
For debugging, the (bows)[https://github.com/latentflip/bows] module is used.
To turn it on:

    localStorage.debug = true
To turn it off:

    delete localStorage.debug

See usage of bows [here](https://github.com/latentflip/bows#usage)

Build
--------------
###Build script for example
To build the script used in the example folder

    npm install
    grunt webpack:build

### Build with source maps and watch
Enable source maps and a watcher that auto-recompiles when making changes.

    npm install
    grunt