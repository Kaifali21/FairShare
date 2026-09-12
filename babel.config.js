module.exports = function (api) {
  const isTest = api.env('test');
  return {
    presets: [isTest ? 'module:@react-native/babel-preset' : 'babel-preset-expo'],
  };
};
