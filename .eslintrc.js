module.exports = {
    "parser": "babel-eslint",
    "env": {
        "browser": true,
        "node": true,
        "es6": true
    },
    "plugins": [
        "react"
    ],
    "extends": "airbnb",
    "parserOptions": {
        "sourceType": "module",
        "ecmaFeatures": {
          "experimentalObjectRestSpread": true
        }
    },
    "rules": {
      "max-len": "off",
      "no-shadow": "off",
      "no-console": "off",
      "no-return-assign": "off",
      "no-param-reassign": "off",
      "no-sequences": "off",
   }
};

