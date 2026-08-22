var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var crypto = require('crypto'); // Assuming you're using Node's built-in crypto module

var customerSchema = new Schema({
  code: {
    type: String, // You can also use Schema.Types.String if UUIDs are stored as strings
    default: function() {
      return 'cus_' + crypto.randomUUID().split('-').join(''); // Replaced arrow function with a regular function
    }
  },
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  companyName: { type: String },
  entity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true // or false depending on your schema needs
  }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
