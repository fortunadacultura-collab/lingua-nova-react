const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

// Serialização do usuário
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Estratégia Google - só configura se as credenciais forem válidas
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'demo-google-client-id') {
  console.log('🔧 Configurando Google OAuth Strategy...');
  console.log('📋 Client ID:', process.env.GOOGLE_CLIENT_ID);
  console.log('📋 Callback URL:', '/api/auth/google/callback');
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔐 Google OAuth callback executado');
      console.log('👤 Profile ID:', profile.id);
      console.log('📧 Email:', profile.emails?.[0]?.value);
      // Verificar se o usuário já existe
      let user = await User.findByGoogleId(profile.id);
      
      if (user) {
        // Só atualizar a foto do perfil se não houver um avatar manual (upload local)
        const shouldUpdateAvatar = !user.profilePicture || !user.profilePicture.startsWith('/uploads/');
        
        if (shouldUpdateAvatar) {
          await user.update({
            avatar_url: profile.photos[0].value
          });
        }
        
        return done(null, user);
      }
      
      // Verificar se existe usuário com o mesmo email
      const existingUser = await User.findByEmail(profile.emails[0].value);
      if (existingUser) {
        // Vincular conta Google ao usuário existente
        const updateData = { google_id: profile.id };
        
        // Só atualizar a foto se não houver um avatar manual
        const shouldUpdateAvatar = !existingUser.profilePicture || !existingUser.profilePicture.startsWith('/uploads/');
        if (shouldUpdateAvatar) {
          updateData.avatar_url = profile.photos[0].value;
        }
        
        await existingUser.update(updateData);
        return done(null, existingUser);
      }
      
      // Criar novo usuário
      const newUser = await User.createSocialUser({
        googleId: profile.id,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        email: profile.emails[0].value,
        avatar_url: profile.photos[0].value,
        isEmailVerified: true // Email já verificado pelo Google
      });
      
      done(null, newUser);
    } catch (error) {
      done(error, null);
    }
  }));
}

// Estratégia Facebook - só configura se as credenciais forem válidas
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_ID !== 'demo-facebook-app-id') {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: '/auth/facebook/callback',
    profileFields: ['id', 'emails', 'name', 'picture']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findByFacebookId(profile.id);
      
      if (user) {
        return done(null, user);
      }
      
      const existingUser = await User.findByEmail(profile.emails[0].value);
      if (existingUser) {
        await existingUser.update({
          facebookId: profile.id,
          profilePicture: profile.picture.data.url
        });
        return done(null, existingUser);
      }
      
      const newUser = await User.createSocialUser({
        facebookId: profile.id,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        email: profile.emails[0].value,
        profilePicture: profile.picture.data.url,
        isEmailVerified: true
      });
      
      done(null, newUser);
    } catch (error) {
      done(error, null);
    }
  }));
}

// Estratégia GitHub - só configura se as credenciais forem válidas
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_ID !== 'demo-github-client-id') {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: '/api/auth/github/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findByGithubId(profile.id);
      
      if (user) {
        return done(null, user);
      }
      
      const existingUser = await User.findByEmail(profile.emails[0].value);
      if (existingUser) {
        await existingUser.update({
          githubId: profile.id,
          profilePicture: profile.photos[0].value
        });
        return done(null, existingUser);
      }
      
      const newUser = await User.createSocialUser({
        githubId: profile.id,
        firstName: profile.displayName.split(' ')[0],
        lastName: profile.displayName.split(' ').slice(1).join(' '),
        email: profile.emails[0].value,
        profilePicture: profile.photos[0].value,
        isEmailVerified: true
      });
      
      done(null, newUser);
    } catch (error) {
      done(error, null);
    }
  }));
}

module.exports = passport;