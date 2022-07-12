const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, args) => {
  const isProduction = !args.mode || args.mode === 'production';

  return {
    // Tell Webpack which file kicks off our app.
    entry: path.resolve(__dirname, 'src/index.js'),
    // Tell Weback to output our bundle to ./dist/bundle.js
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
    },
    // Tell Webpack which directories to look in to resolve import statements.
    // Normally Webpack will look in node_modules by default but since we’re overriding
    // the property we’ll need to tell it to look there in addition to the
    // bower_components folder.
    resolve: {
      modules: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, 'bower_components'),
      ],
    },
    optimization: {
      minimize: isProduction
    },
    // These rules tell Webpack how to process different module types.
    // Remember, *everything* is a module in Webpack. That includes
    // CSS, and (thanks to our loader) HTML.
    module: {
      rules: [
        {
          // If you see a file that ends in .html, send it to these loaders.
          test: /\.js$/,
          // This is an example of chained loaders in Webpack.
          // Chained loaders run last to first. So it will run
          // polymer-webpack-loader, and hand the output to
          // babel-loader. This let's us transpile JS in our `<script>` elements.
          use: [
            {
              loader: 'babel-loader',
              options: {
                presets: ['@babel/preset-env'],
              },
              // Optionally exclude node_modules from transpilation except for polymer-webpack-loader:
              // exclude: /node_modules\/(?!polymer-webpack-loader\/).*/
            },
            { loader: 'polymer-webpack-loader' },
          ],
        },
        {
          test: /\.png$/,
          loader: 'file-loader',
          options: {
            name: 'img/[name]-[hash].[ext]',
          },
        },
      ],
    },
    // Enable the Webpack dev server which will build, serve, and reload our
    // project on changes.
    devServer: {
      contentBase: path.join(__dirname, 'dist'),
      compress: true,
      port: 9000,
    },
    plugins: [
      // This plugin will generate an index.html file for us that can be used
      // by the Webpack dev server. We can give it a template file (written in EJS)
      // and it will handle injecting our bundle for us.
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'src/index.ejs'),
      }),
    ],
  };
};
