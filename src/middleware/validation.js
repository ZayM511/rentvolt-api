const Joi = require('joi');

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
        'string.length': 'State must be 2-letter abbreviation',
        'any.required': 'State is required'
      }),
    filters: Joi.object({
      sources: Joi.array().items(Joi.string().valid('rentals', 'zillow', 'apartments', 'rentcafe', 'hotpads', 'zumper')),
      maxPrice: Joi.number().integer().min(0).max(100000),
      minBeds: Joi.number().integer().min(0).max(20)
    })
  }),

  stripeCheckout: Joi.object({
    plan: Joi.string()
      .valid('basic', 'pro')
      .required()
      .messages({
        'any.required': 'Plan is required (basic or pro)'
      })
  })
};

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false });
    
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

module.exports = { schemas, validate };
