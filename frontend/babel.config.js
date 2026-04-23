module.exports = function(api) {
  api.cache(true);
  
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@api': './src/api',
            '@components': './src/components',
            '@screens': './src/screens',
            '@navigation': './src/navigation',
            '@services': './src/services',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@types': './src/types',
            '@assets': './assets',
          },
        },
      ],
    ],
  };
};
