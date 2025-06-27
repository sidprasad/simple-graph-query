const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'simple-graph-query.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'SimpleGraphQuery',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web',
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      // Node.js polyfills for antlr4ts
      "assert": require.resolve("assert/"),
      "buffer": require.resolve("buffer/"),
      "util": require.resolve("util/"),
      "stream": require.resolve("stream-browserify"),
      "process": require.resolve("process/browser"),
      "os": false,
      "path": false,
      "fs": false
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
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
              declaration: false  // Disable .d.ts generation
            }
          }
        }
      }
    ]
  },
  mode: 'development',
  devtool: 'source-map',
  optimization: {
    minimize: false
  }
};