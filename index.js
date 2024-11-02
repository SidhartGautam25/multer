var makeMiddleware = require("./lib/make-middleware");

var diskStorage = require("./storage/disk");
var memoryStorage = require("./storage/memory");
var MulterError = require("./lib/multer-error");

function allowAll(req, file, cb) {
  cb(null, true);
}

function Multer(options) {
  if (options.storage) {
    this.storage = options.storage;
    // so this object's storage property is a object
    // and this object has two things
    // getFilename and getDestination
  } else if (options.dest) {
    this.storage = diskStorage({ destination: options.dest });
  } else {
    this.storage = memoryStorage();
  }

  // below properties are not of our concern
  this.limits = options.limits;
  this.preservePath = options.preservePath;

  // since we have not provided and fileFilter
  // this.fileFilter will become allowAll
  // and allowall does a very simple thing
  // it calls the callback function with parameteres null and true
  this.fileFilter = options.fileFilter || allowAll;
  console.log("in Multer constructor ", this);
}

Multer.prototype._makeMiddleware = function (fields, fileStrategy) {
  // and this function is really very abnormal
  // _makeMiddleware is a factory function
  // fields is an array of obejct,and that object has
  // property like name whose value for us is "file" and maxCount whose value is 1
  // and fileStrategy is a string whose value is "VALUE"

  function setup() {
    var fileFilter = this.fileFilter;
    var filesLeft = Object.create(null);

    // fields has basically one object
    // so what this whole loop is doing is setting file property
    // of filesLeft to 1
    fields.forEach(function (field) {
      // yes maxCount is a number whose value is 1
      if (typeof field.maxCount === "number") {
        filesLeft[field.name] = field.maxCount;
        // filesLeft.file=1
        // this is what this line is doing
      } else {
        filesLeft[field.name] = Infinity;
      }
    });

    function wrappedFileFilter(req, file, cb) {
      if ((filesLeft[file.fieldname] || 0) <= 0) {
        // this is useless for us
        return cb(new MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
      }

      filesLeft[file.fieldname] -= 1;
      // basically wrappedFileFilter is cally fileFilter function
      // which in return just call the passed  callback function
      fileFilter(req, file, cb);
    }

    // basically setup return a object which has 5 things
    // limits is not currently our topic of consideration
    // preservepath,we will come to this
    // storage basically is equal to storage which is an object with two properties
    // fileFilter is equal to wrappedFileFilter
    // file strategy is a string whose value is equal to "VALUE"
    return {
      limits: this.limits,
      preservePath: this.preservePath,
      storage: this.storage,
      fileFilter: wrappedFileFilter,
      fileStrategy: fileStrategy,
    };
  }
  // here this bind is just used so that setup runs perfectly fine with this Multer
  // object and not other values
  // so makeMiddleware take a object as a argument and that object has
  // five properties
  // and this makeMiddleware is the most fucking thing here
  return makeMiddleware(setup.bind(this));
};

Multer.prototype.single = function (name) {
  return this._makeMiddleware([{ name: name, maxCount: 1 }], "VALUE");
  // here name is a string whose value is file
  // so basically this single method is calling _makeMiddleware method on
  // this object with name , maxCount and "VALUE" argument
};

// Multer.prototype.array = function (name, maxCount) {
//   return this._makeMiddleware([{ name: name, maxCount: maxCount }], 'ARRAY')
// }

// Multer.prototype.fields = function (fields) {
//   return this._makeMiddleware(fields, 'OBJECT')
// }

// Multer.prototype.none = function () {
//   return this._makeMiddleware([], 'NONE')
// }

// Multer.prototype.any = function () {
//   function setup () {
//     return {
//       limits: this.limits,
//       preservePath: this.preservePath,
//       storage: this.storage,
//       fileFilter: this.fileFilter,
//       fileStrategy: 'ARRAY'
//     }
//   }

//   return makeMiddleware(setup.bind(this))
// }

function multer(options) {
  if (options === undefined) {
    return new Multer({});
  }

  if (typeof options === "object" && options !== null) {
    return new Multer(options);
  }

  throw new TypeError("Expected object for argument options");
}

module.exports = multer;
module.exports.diskStorage = diskStorage;
module.exports.memoryStorage = memoryStorage;
module.exports.MulterError = MulterError;
