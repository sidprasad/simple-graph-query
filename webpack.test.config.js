const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'simple-graph-query.test.bundle.js', // Changed to match your naming convention
    path: path.resolve(__dirname, 'dist'),
    library: 'SimpleGraphQuery',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web',
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      // Test with NO polyfills
      "os": false,
      "path": false,
      "fs": false,
      "stream": false,
      "util": false,
      "buffer": false,
      "assert": false,
      "process": false  // Test without process polyfill too
    }
  },
  plugins: [
    // Test with no global polyfills
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json',
            compilerOptions: {
              declaration: false
            }
          }
        }
      }
    ]
  },
  mode: 'production',
  optimization: {
    minimize: true
  }
};
