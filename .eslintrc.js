module.exports = {
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
      "max-len": "off"
    }
};

