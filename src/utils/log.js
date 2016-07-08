const errorMessageConsoleShouldBeBinded = 'console should be binded';
const atlantPrefixDefault = 'Atlant.js';

export class Console {
  atlantPrefix = `${atlantPrefixDefault}: `;

  static log(...args) {
    if (!('active' in this)) throw new Error(errorMessageConsoleShouldBeBinded);
    if (!this.active) return;

    console.log(this.atlantPrefix, ...args);
  }

  static logIt(...args) {
    if (!('active' in this)) throw new Error(errorMessageConsoleShouldBeBinded);
    if (!this.active) return _ => _;

    return what => {
      console.log(...args, what);
      return what;
    };
  }

  static warn(...args) {
    if (!('active' in this)) throw new Error(errorMessageConsoleShouldBeBinded);
    if (!this.active) return;

    console.warn(this.atlantPrefix, ...args);
  }

  static error(...args) {
    if (!('active' in this)) throw new Error(errorMessageConsoleShouldBeBinded);
    if (!this.active) return;

    console.error(this.atlantPrefix, ...args);
  }

  static time(name) {
    if (!('active' in this)) throw new Error(errorMessageConsoleShouldBeBinded);
    if (!this.active) return;

    if (console.time) {
      console.time(this.atlantPrefix + name);
      return;
    }
  }

  static timeEnd(name) {
    if (!('active' in this)) throw new Error(errorMessageConsoleShouldBeBinded);
    if (!this.active) return;

    if (console.timeEnd) {
      console.timeEnd(this.atlantPrefix + name);
      return;
    }
    return;
  }
}

export const error = new class error extends Console {
  atlantPrefix = `${atlantPrefixDefault} [error] :`
  active = true
};

export const server = new class server extends Console {
  atlantPrefix = `${atlantPrefixDefault} [server] :`
  active = true
};

export const action = new class action extends Console {
  atlantPrefix = `${atlantPrefixDefault} [action] :`
  active = true
};

export const render = new class render extends Console {
  atlantPrefix = `${atlantPrefixDefault} [render] :`
  active = true
};

export const client = new class client extends Console {
  atlantPrefix = `${atlantPrefixDefault} [client] :`
  active = true
};

export const deprecated = new class deprecated extends Console {
  atlantPrefix = `${atlantPrefixDefault} [client] :`
  active = true
};

