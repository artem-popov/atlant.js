/**
 * This is realization of location protocol for server side.
 *
 * */


const location = {
  get pathname() {
    console.log('server:', this);
  },
};

export default location;


