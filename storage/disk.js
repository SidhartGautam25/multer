var fs = require("fs");
var os = require("os");
var path = require("path");
var crypto = require("crypto");
var mkdirp = require("mkdirp");

function getFilename(req, file, cb) {
  crypto.randomBytes(16, function (err, raw) {
    cb(err, err ? undefined : raw.toString("hex"));
  });
}

function getDestination(req, file, cb) {
  cb(null, os.tmpdir());
}

function DiskStorage(opts) {
  console.log("DiskStorage constructor function get called");
  this.getFilename = opts.filename || getFilename;
  // and we know opts.filename is just a function with parameters req,file,and
  // a callback function

  if (typeof opts.destination === "string") {
    mkdirp.sync(opts.destination);
    this.getDestination = function ($0, $1, cb) {
      cb(null, opts.destination);
    };
  } else {
    // getDestination become equal to opts.destination function
    this.getDestination = opts.destination || getDestination;
  }

  console.log("DiskStorage returned object looks like this ", this);
}

DiskStorage.prototype._handleFile = function _handleFile(req, file, cb) {
  var that = this;
  console.log("you are inside _handleFunction");
  console.log("file inside handleFunction is ", file);
  console.log("i am calling getDestionation");
  that.getDestination(req, file, function (err, destination) {
    if (err) return cb(err);
    console.log("i am callback function of getDestination");
    console.log("i am calling getFilename");
    that.getFilename(req, file, function (err, filename) {
      if (err) return cb(err);
      console.log("i am callback fucntion of getFilename");

      var finalPath = path.join(destination, filename);
      console.log("finalpath is ", finalPath);
      var outStream = fs.createWriteStream(finalPath);
      console.log("this is somewhat risky thing");
      console.log("file looks like ", file);
      console.log(
        "file stream look like before piping to outstream ",
        file.stream
      );
      file.stream.pipe(outStream);
      outStream.on("error", cb);
      outStream.on("finish", function () {
        console.log("after finising outStream work");
        console.log(
          "i am calling callback fucntion of handleFile with first arg equal to null and "
        );
        var temp = {
          destination: destination,
          filename: filename,
          path: finalPath,
          size: outStream.bytesWritten,
        };
        console.log("second arg equal to ", temp);
        cb(null, {
          destination: destination,
          filename: filename,
          path: finalPath,
          size: outStream.bytesWritten,
        });
      });
    });
  });
};

DiskStorage.prototype._removeFile = function _removeFile(req, file, cb) {
  var path = file.path;

  delete file.destination;
  delete file.filename;
  delete file.path;

  fs.unlink(path, cb);
};

module.exports = function (opts) {
  // opts is just an object with two main properties
  // filename and destination
  // and they look something like this
  //  destination: (req, file, cb) => {
  //   cb(null, uploadDir);
  // },
  // filename: (req, file, cb) => {
  //   cb(null, Date.now() + path.extname(file.originalname));
  // },

  // and if you observe these are just a function which under the hood,
  // just call the callback function
  return new DiskStorage(opts);
  // so basically this set the getFilename and getDestination
  // that's it.
};
