const Joi = require('joi');

const VALID_SOURCES = ['rentals', 'zillow', 'apartments', 'rentcafe', 'hotpads', 'zumper'];
const VALID_SORT = ['price', 'source'];

const schemas = {
  scrapeListings: Joi.object({
    city: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s-]+$/)
      .required()
      .messages({
        'string.pattern.base': 'City must contain only letters, spaces, and hyphens',
        'any.required': 'City is required'
      }),
    state: Joi.string()
      .length(2)
      .lowercase()
      .pattern(/^[a-z]+$/)
      .required()
      .messages({
        'string.length': 'State must be a 2-letter abbreviation (e.g. ca, ny)',
        'any.required': 'State is required'
      }),
    filters: Joi.object({
      sources: Joi.array().items(Joi.string().valid(...VALID_SOURCES)).min(1),
      maxPrice: Joi.number().integer().min(0).max(100000),
      minBeds: Joi.number().integer().min(0).max(20),
      maxBeds: Joi.number().integer().min(0).max(20),
      sortBy: Joi.string().valid(...VALID_SORT).default('price'),
      sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
      limit: Joi.number().integer().min(1).max(500)
    }).default({})
  }),

  stripeCheckout: Joi.object({
    plan: Joi.string()
      .valid('growth', 'scale', 'enterprise')
      .required()
      .messages({
        'any.required': 'Plan is required (growth, scale, or enterprise)'
      })
  })
};

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    // Skip validation for GET requests
    if (req.method === 'GET') return next();

    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req.validated = value;
    next();
  };
};

module.exports = { schemas, validate, VALID_SOURCES };
