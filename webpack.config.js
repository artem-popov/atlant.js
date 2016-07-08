var nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/atlant.js',
  target: 'node',
  externals: [nodeExternals()],
  output: {
    path: './lib/',
    filename: 'atlant.js',
  },
  module: {
    loaders: [{
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader',
    }],
  },
};
