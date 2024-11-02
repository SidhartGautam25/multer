var is = require("type-is");
var Busboy = require("busboy");
var extend = require("xtend");
var onFinished = require("on-finished");
var appendField = require("append-field");

var Counter = require("./counter");
var MulterError = require("./multer-error");
var FileAppender = require("./file-appender");
var removeUploadedFiles = require("./remove-uploaded-files");

function drainStream(stream) {
  stream.on("readable", stream.read.bind(stream));
}

function makeMiddleware(setup) {
  // again makeMiddleware is  returning a middleware
  // as it has req,res and next object
  return function multerMiddleware(req, res, next) {
    if (!is(req, ["multipart"])) return next();

    var options = setup();
    console.log("options in makeMiddleware looks like this");
    console.log(options);
    // first we are calling setup function
    // which basically will give us an object with five properties

    // now we storing those properties to a variable to use it ahead
    var limits = options.limits;
    var storage = options.storage;
    var fileFilter = options.fileFilter;
    var fileStrategy = options.fileStrategy;
    var preservePath = options.preservePath;

    req.body = Object.create(null);

    var busboy;

    try {
      // initiating our busboy
      busboy = new Busboy({
        headers: req.headers,
        limits: limits,
        preservePath: preservePath,
      });
    } catch (err) {
      return next(err);
    }

    // appender is just a simple object which has two properties
    // req and fileStrategy
    // req is equal to req object and fileStrategy is equal to "VALUE" currently
    console.log("let go to fileAppender");
    console.log("file strategy is ", fileStrategy);
    var appender = new FileAppender(fileStrategy, req);

    // This variable is a boolean flag to track whether the file upload
    //  process has completed.
    var isDone = false;

    // this is related to reading thing
    var readFinished = false;
    // this is related to error
    var errorOccured = false;
    // Counter class that extends Node.js’s EventEmitter to manage a simple integer
    //  counter with events.
    var pendingWrites = new Counter();

    // this array take care of uploded files
    var uploadedFiles = [];

    function done(err) {
      // Ensures only one call to the done logic by using isDone.
      // Unpipes and drains the request to stop busboy from further processing.
      // Removes all listeners from busboy to free up resources.
      // Calls next middleware or error handler in Express when the process is complete.
      if (isDone) return;
      isDone = true;

      req.unpipe(busboy);
      drainStream(req);
      busboy.removeAllListeners();

      onFinished(req, function () {
        next(err);
      });
    }

    function indicateDone() {
      // indicateDone function checks if the file upload process is fully complete and,
      // if so, calls the done function to finalize the operation.
      if (readFinished && pendingWrites.isZero() && !errorOccured) done();
    }

    // this function also handle error stuff
    function abortWithError(uploadError) {
      if (errorOccured) return;
      errorOccured = true;

      pendingWrites.onceZero(function () {
        function remove(file, cb) {
          storage._removeFile(req, file, cb);
        }

        removeUploadedFiles(
          uploadedFiles,
          remove,
          function (err, storageErrors) {
            if (err) return done(err);

            uploadError.storageErrors = storageErrors;
            done(uploadError);
          }
        );
      });
    }

    // this is error related stuff
    function abortWithCode(code, optionalField) {
      abortWithError(new MulterError(code, optionalField));
    }

    // handle text field data
    busboy.on(
      "field",
      function (fieldname, value, fieldnameTruncated, valueTruncated) {
        // If the fieldname is null or undefined, it means there’s a missing field name
        //  in the form data.This triggers an error using
        // abortWithCode("MISSING_FIELD_NAME"), stopping further processing with a
        // specific error message.
        console.log("busboy on field event ");
        console.log("fieldname is ", fieldname);
        console.log("value is ", value);
        console.log("fieldnameTruncated is ", fieldnameTruncated);
        console.log("valueTruncated is ", valueTruncated);
        if (fieldname == null) return abortWithCode("MISSING_FIELD_NAME");
        // fieldname length is larger than the limit
        if (fieldnameTruncated) return abortWithCode("LIMIT_FIELD_KEY");
        // if value of the fieldname is exeeding its size
        if (valueTruncated)
          return abortWithCode("LIMIT_FIELD_VALUE", fieldname);

        // Work around bug in Busboy (https://github.com/mscdex/busboy/issues/6)
        if (
          limits &&
          Object.prototype.hasOwnProperty.call(limits, "fieldNameSize")
        ) {
          if (fieldname.length > limits.fieldNameSize)
            return abortWithCode("LIMIT_FIELD_KEY");
        }

        appendField(req.body, fieldname, value);
      }
    );

    // handle files
    // this event is triggered when file field is there in form data

    busboy.on(
      "file",
      function (fieldname, fileStream, filename, encoding, mimetype) {
        // don't attach to the files object, if there is no file
        if (!filename) return fileStream.resume();

        // Work around bug in Busboy (https://github.com/mscdex/busboy/issues/6)
        // just checking fieldname size dont exceed the limits
        if (
          limits &&
          Object.prototype.hasOwnProperty.call(limits, "fieldNameSize")
        ) {
          if (fieldname.length > limits.fieldNameSize)
            return abortWithCode("LIMIT_FIELD_KEY");
        }

        // a file object is created to store metadata about the uploaded file,
        // such as the fieldname, originalname, encoding, and mimetype.
        var file = {
          fieldname: fieldname,
          originalname: filename,
          encoding: encoding,
          mimetype: mimetype,
        };

        var placeholder = appender.insertPlaceholder(file);
        console.log(
          "placeholder looks like this in busboy on file event ",
          placeholder
        );

        fileFilter(req, file, function (err, includeFile) {
          if (err) {
            appender.removePlaceholder(placeholder);
            return abortWithError(err);
          }

          if (!includeFile) {
            appender.removePlaceholder(placeholder);
            return fileStream.resume();
          }

          var aborting = false;
          pendingWrites.increment();

          Object.defineProperty(file, "stream", {
            configurable: true,
            enumerable: false,
            value: fileStream,
          });

          fileStream.on("error", function (err) {
            pendingWrites.decrement();
            abortWithError(err);
          });

          fileStream.on("limit", function () {
            aborting = true;
            abortWithCode("LIMIT_FILE_SIZE", fieldname);
          });
          console.log(
            "calling _handleFile on storage inside busboy file event "
          );
          console.log("storage now looks like this ", storage);
          storage._handleFile(req, file, function (err, info) {
            if (aborting) {
              appender.removePlaceholder(placeholder);
              uploadedFiles.push(extend(file, info));
              return pendingWrites.decrement();
            }

            if (err) {
              appender.removePlaceholder(placeholder);
              pendingWrites.decrement();
              return abortWithError(err);
            }

            var fileInfo = extend(file, info);

            appender.replacePlaceholder(placeholder, fileInfo);
            uploadedFiles.push(fileInfo);
            pendingWrites.decrement();
            indicateDone();
          });
        });
      }
    );

    // All below are not of our concern as these are triggered when something wrong
    // happen to our files and req
    busboy.on("error", function (err) {
      abortWithError(err);
    });
    busboy.on("partsLimit", function () {
      abortWithCode("LIMIT_PART_COUNT");
    });
    busboy.on("filesLimit", function () {
      abortWithCode("LIMIT_FILE_COUNT");
    });
    busboy.on("fieldsLimit", function () {
      abortWithCode("LIMIT_FIELD_COUNT");
    });

    // this will be triggered when the file uploading thing will be done
    busboy.on("finish", function () {
      readFinished = true;
      indicateDone();
    });

    // req is a readable stream and busboy is writeable one
    // and we are just piping both of them
    req.pipe(busboy);
  };
}

module.exports = makeMiddleware;
