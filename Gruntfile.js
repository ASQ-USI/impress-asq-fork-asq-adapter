/**
  @fileoverview main Grunt task file
**/
'use strict';

var webpack = require('webpack');

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    webpack: {
      build: {
        entry: './example.js',
        output: {
          path: './example/js/',
          filename: 'example.js'
        }
      },
      'build-dev': {
        entry: './example.js',
        output: {
          path: './example/js/',
          filename: 'impressAsqAdapterExample.js'
        },
        watch: true,
        keepalive: true,
        devtool: 'sourcemap',
        debug: true
      }
    },
     urequire: {
          umd: { // using the old DEPRECATED v0.1.x format
            template: 'combined',
            filez: ['**/*'],
            path: 'browser',
            dependencies: {
              imports: {'bows':'bows'},
              // rootExports: {
              //   root: {
              //     'index': 'impressAsqForkAsqAdapter'
              //   }
              // }
            },
            main: 'index',
            dstPath: 'dist/impressasqforkasqadapter.js'
          },
          umd_min: { 
            derive: 'umd',            
            dependencies: {
              imports: {'bows':'bows'},
              // rootExports: {
              //   root: {
              //     'index': 'impressAsqForkAsqAdapter'
              //   }
              // }
            },
            optimize: 'uglify2',
            dstPath: 'dist/impressasqforkasqadapter.min.js'
          },
          _defaults: {
            // rootExports: 'impressAsqForkAsqAdapter',
            allNodeRequires: true,
            verbose: true
          }
        }
  });

  // Default task(s).
  grunt.registerTask('default', ['webpack:build-dev']);
  grunt.registerTask('dist', ['urequire:umd', 'urequire:umd_min']);

  //npm tasks
  require('load-grunt-tasks')(grunt);
};
