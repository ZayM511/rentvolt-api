const Joi = require('joi');

const VALID_SORT = ['price', 'source'];

const citySchema = Joi.string()
  .min(2).max(50).pattern(/^[a-zA-Z\s-]+$/).required()
  .messages({
    'string.pattern.base': 'City must contain only letters, spaces, and hyphens',
    'any.required': 'City is required'
  });

const stateSchema = Joi.string()
  .length(2).lowercase().pattern(/^[a-z]+$/).required()
  .messages({
    'string.length': 'State must be a 2-letter abbreviation (e.g. ca, ny)',
    'any.required': 'State is required'
  });

const filtersSchema = Joi.object({
  maxPrice: Joi.number().integer().min(0).max(100000),
  minBeds:  Joi.number().integer().min(0).max(20),
  maxBeds:  Joi.number().integer().min(0).max(20),
  sortBy:   Joi.string().valid(...VALID_SORT).default('price'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  limit:    Joi.number().integer().min(1).max(500)
}).default({});

const schemas = {
  scrapeListings: Joi.object({
    city: citySchema,
    state: stateSchema,
    filters: filtersSchema
  }),

  scrapeBulk: Joi.object({
    locations: Joi.array()
      .items(Joi.object({ city: citySchema, state: stateSchema }))
      .min(1)
      .max(10)
      .required(),
    filters: filtersSchema
  }),

  stripeCheckout: Joi.object({
    plan: Joi.string().valid('growth', 'scale', 'enterprise').required(),
    email: Joi.string().email().optional()
  }),

  freeKey: Joi.object({
    email: Joi.string().email().optional()
  }).default({}),

  zip: Joi.string().pattern(/^\d{5}$/).required().messages({
    'string.pattern.base': 'ZIP must be 5 digits'
  }),

  acceptTerms: Joi.object({
    version: Joi.string().required()
  }),

  feedback: Joi.object({
    email: Joi.string().email().optional(),
    reason: Joi.string().max(100).optional(),
    message: Joi.string().max(2000).optional()
  })
};

const validate = (schema, property = 'body') => (req, res, next) => {
  if (req.method === 'GET') return next();
  const { error, value } = schema.validate(req[property], {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map((d) => ({ field: d.path.join('.'), message: d.message }))
    });
  }
  req.validated = value;
  next();
};

const validateParam = (key, schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.params[key]);
  if (error) {
    return res.status(400).json({
      error: 'Invalid parameter',
      field: key,
      message: error.details[0].message
    });
  }
  req.params[key] = value;
  next();
};

module.exports = { schemas, validate, validateParam };
