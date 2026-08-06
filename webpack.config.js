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
      // antlr4ts calls assert() and reads util.inspect.custom at runtime, so
      // both are real polyfills. It never requires buffer or stream, so those
      // resolve to empty modules and stay out of the bundle.
      "assert": require.resolve("assert/"),
      "util": require.resolve("util/"),
      "buffer": false,
      "stream": false,
      "process": require.resolve("process/browser"),
      "os": false,
      "path": false,
      "fs": false
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
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
  mode: 'production',
  // The .map is not published, so the bundle must not point at it. "hidden"
  // still writes the map next to the bundle for local debugging, but leaves
  // out the sourceMappingURL comment that would 404 for consumers.
  devtool: 'hidden-source-map'
};