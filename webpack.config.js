const path = require('path');

module.exports = {
    mode: 'development', // Modo desarrollo
    entry: './src/index.js', // Archivo de entrada
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js', // Archivo de salida
    },
    devServer: {
        static: './dist', // Carpeta donde lanzara los archivos
        port: 3000, // Puerto del servidor de desarrollo
        open: true, // Abre el navegador automáticamente
        hot: true, // Habilita recarga en vivo
    },
    module: {
        rules: [
            {
                test: /\.js$/, // Archivos JS
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            },
            {
                test: /\.scss$/, // Procesar archivos SCSS de Bootstrap
                use: ['style-loader', 'css-loader', 'sass-loader']
            },
            {
                test: /\.css$/, // Procesar archivos CSS
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf|svg)$/, // Carga fuentes de FontAwesome
                type: 'asset/resource',
            }
        ]
    }
};