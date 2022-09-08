const crypto = require('crypto')

const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const sendgridTransport = require('nodemailer-sendgrid-transport')
const { validationResult } = require('express-validator')

const User = require('../models/user')

const transporter = nodemailer.createTransport(
  sendgridTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY
    }
  })
)

exports.getLogin = (req, res, next) => {
  let message = req.flash('error')
  if (message.length > 0) {
    message = message[0]
  } else {
    message = null
  }
  res.render('auth/login', {
    path: '/login',
    pageTitle: 'Login',
    errorMessage: message,
    oldInput: {
      email: '',
      password: ''
    },
    validationErrors: []
  })
}

exports.postLogin = (req, res, next) => {
  const email = req.body.email
  const password = req.body.password
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(422).render('auth/login', {
      path: '/login',
      pageTitle: 'Login',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        email: email,
        password: password
      },
      validationErrors: errors.array()
    })
  }

  User.findOne({ email: email })
    .then(user => {
      if (!user) {
        return res.status(422).render('auth/login', {
          path: '/login',
          pageTitle: 'Login',
          errorMessage: 'E-mail not found.',
          oldInput: {
            email: email,
            password: password
          },
          validationErrors: [{ param: 'email' }]
        })
      }
      bcrypt.compare(password, user.password).then(doMatch => {
        if (doMatch) {
          req.session.user = user
          req.session.isLoggedIn = true
          return req.session.save(err => {
            res.redirect('/')
          })
        }
        return res.status(422).render('auth/login', {
          path: '/login',
          pageTitle: 'Login',
          errorMessage: 'Password is incorrect.',
          oldInput: {
            email: email,
            password: password
          },
          validationErrors: [{ param: 'password' }]
        })
      })
    })
    .catch(err => {
      const error = new Error(err)
      error.httpStatusCode = 500
      return next(error)
    })
}

exports.postLogout = (req, res, next) => {
  req.session.destroy(err => {
    res.redirect('/')
  })
}

exports.postSignup = (req, res, next) => {
  const name = req.body.username
  const email = req.body.email
  const password = req.body.password
  const confirmPassword = req.body.confirmPassword
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/signup', {
      path: '/signup',
      pageTitle: 'Sign Up',
      errorMessage: errors.array()[0].msg,
      oldInput: { username: name, email: email, password: password },
      validationErrors: errors.array()
    })
  }
  bcrypt
    .hash(password, 12)
    .then(hashedPassword => {
      const user = new User({
        name: name,
        email: email,
        password: hashedPassword,
        cart: {
          item: []
        }
      })
      return user.save()
    })
    .then(result => {
      res.redirect('/login')
      return transporter.sendMail({
        to: email,
        from: 'EatFrenchfries@mail.com',
        subject: 'Sign Up Successed!',
        html: '<h1>You successfully signed up!</h1>'
      })
    })
    .catch(err => {
      const error = new Error(err)
      error.httpStatusCode = 500
      return next(error)
    })
}

exports.getSignup = (req, res, next) => {
  let message = req.flash('error')
  if (message.length > 0) {
    message = message[0]
  } else {
    message = null
  }
  res.render('auth/signup', {
    path: '/signup',
    pageTitle: 'Sign Up',
    errorMessage: message,
    oldInput: {
      username: '',
      password: '',
      email: ''
    },
    validationErrors: []
  })
}

exports.getReset = (req, res, next) => {
  let message = req.flash('error')
  if (message.length > 0) {
    message = message[0]
  } else {
    message = null
  }
  res.render('auth/reset', {
    path: '/reset',
    pageTitle: 'Reset Password',
    errorMessage: message
  })
}

exports.postReset = (req, res, next) => {
  crypto.randomBytes(32, (err, buffer) => {
    if (err) {
      return res.redirect('/reset')
    }
    const token = buffer.toString('hex')
    User.findOne({ email: req.body.email })
      .then(user => {
        if (!user) {
          req.flash('error', 'No account with that email found.')
          return res.redirect('/reset')
        }
        user.resetToken = token
        user.resetTokenExpiration = Date.now() + 3600000
        return user.save()
      })
      .then(result => {
        transporter.sendMail({
          to: req.body.email,
          from: 'EatFrenchfries@mail.com',
          subject: 'Password reset',
          html: `
              <p>You requested a password reset.</p>
              <p>Click this <a href="http://localhost:3000/reset/${token}">link</a> to set a new password.</p>
            `
        })
        res.redirect('/')
      })
      .catch(err => {
        const error = new Error(err)
        error.httpStatusCode = 500
        return next(error)
      })
  })
}

exports.getNewPassword = (req, res, next) => {
  const token = req.params.token
  User.findOne({ resetToken: token, resetTokenExpiration: { $gt: Date.now() } })
    .then(user => {
      let message = req.flash('error')
      if (message.length > 0) {
        message = message[0]
      } else {
        message = null
      }
      res.render('auth/new-password', {
        path: '/new-password',
        pageTitle: 'New Password',
        errorMessage: message,
        userId: user._id.toString(),
        passwordToken: token
      })
    })
    .catch(err => {
      const error = new Error(err)
      error.httpStatusCode = 500
      return next(error)
    })
}

exports.postNewPassword = (req, res, next) => {
  const newpassword = req.body.password
  const userId = req.body.userId
  const passwordToken = req.body.passwordToken
  let resetUser

  User.findOne({ resetToken: passwordToken, resetTokenExpiration: { $gt: Date.now() }, _id: userId })
    .then(user => {
      resetUser = user
      return bcrypt.hash(newpassword, 12)
    })
    .then(hashedPassword => {
      resetUser.password = hashedPassword
      resetUser.resetToken = undefined
      resetUser.resetTokenExpiration = undefined
      return resetUser.save()
    })
    .then(result => {
      res.redirect('/login')
    })
    .catch(err => {
      const error = new Error(err)
      error.httpStatusCode = 500
      return next(error)
    })
}
