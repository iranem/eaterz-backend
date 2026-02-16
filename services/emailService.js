const nodemailer = require('nodemailer');

// Configuration du transporteur email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // true pour 465, false pour les autres ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Vérifier la connexion au serveur SMTP
const verifyConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Connexion SMTP établie');
    return true;
  } catch (error) {
    console.error('❌ Erreur connexion SMTP:', error.message);
    return false;
  }
};

/**
 * Envoie un email
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'EATERZ <noreply@eaterz.com>',
      to,
      subject,
      html,
      text
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email envoyé: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Email de vérification de compte
 */
const sendVerificationEmail = async (user, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #F98805, #F35695); padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .content { padding: 40px; }
        .content h2 { color: #264414; margin-top: 0; }
        .button { display: inline-block; background: #F98805; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .button:hover { background: #e07a04; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        .link { color: #F98805; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🥗 EATERZ</h1>
        </div>
        <div class="content">
          <h2>Bienvenue ${user.prenom} !</h2>
          <p>Merci de vous être inscrit sur EATERZ, votre plateforme de healthy food préférée.</p>
          <p>Pour activer votre compte, veuillez cliquer sur le bouton ci-dessous :</p>
          <p style="text-align: center;">
            <a href="${verificationUrl}" class="button">Vérifier mon email</a>
          </p>
          <p>Ou copiez ce lien dans votre navigateur :</p>
          <p class="link">${verificationUrl}</p>
          <p>Ce lien expire dans 24 heures.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} EATERZ - Tous droits réservés</p>
          <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: '🥗 EATERZ - Vérifiez votre adresse email',
    html,
    text: `Bienvenue ${user.prenom}! Vérifiez votre email: ${verificationUrl}`
  });
};

/**
 * Email de réinitialisation de mot de passe
 */
const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #F98805, #F35695); padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .content { padding: 40px; }
        .content h2 { color: #264414; margin-top: 0; }
        .button { display: inline-block; background: #F98805; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        .link { color: #F98805; word-break: break-all; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🥗 EATERZ</h1>
        </div>
        <div class="content">
          <h2>Réinitialisation de mot de passe</h2>
          <p>Bonjour ${user.prenom},</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe EATERZ.</p>
          <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
          </p>
          <p>Ou copiez ce lien dans votre navigateur :</p>
          <p class="link">${resetUrl}</p>
          <div class="warning">
            <strong>⚠️ Important :</strong> Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
          </div>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} EATERZ - Tous droits réservés</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: '🔐 EATERZ - Réinitialisation de mot de passe',
    html,
    text: `Réinitialisez votre mot de passe: ${resetUrl}`
  });
};

/**
 * Email de confirmation de commande
 */
const sendOrderConfirmationEmail = async (user, commande, items) => {
  const orderUrl = `${process.env.FRONTEND_URL}/commandes/${commande.id}`;
  
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.plat.nom}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantite}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${item.prixUnitaire} DZD</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${item.sousTotal} DZD</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #22C55E, #264414); padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .content { padding: 40px; }
        .order-number { background: #f0fdf4; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .order-number span { font-size: 24px; font-weight: bold; color: #22C55E; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f8f9fa; padding: 10px; text-align: left; }
        .total { font-size: 18px; font-weight: bold; text-align: right; padding: 15px 0; border-top: 2px solid #264414; }
        .button { display: inline-block; background: #F98805; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Commande Confirmée</h1>
        </div>
        <div class="content">
          <p>Bonjour ${user.prenom},</p>
          <p>Merci pour votre commande ! Voici le récapitulatif :</p>
          
          <div class="order-number">
            <p style="margin: 0; color: #666;">Numéro de commande</p>
            <span>${commande.numero}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Plat</th>
                <th style="text-align: center;">Qté</th>
                <th style="text-align: right;">Prix</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <p style="text-align: right;">Sous-total: <strong>${commande.sousTotal} DZD</strong></p>
          ${commande.reduction > 0 ? `<p style="text-align: right; color: #22C55E;">Réduction: <strong>-${commande.reduction} DZD</strong></p>` : ''}
          <p style="text-align: right;">Frais de livraison: <strong>${commande.fraisLivraison} DZD</strong></p>
          <p class="total">Total: ${commande.total} DZD</p>

          <p><strong>Adresse de livraison:</strong><br>${commande.adresseLivraison}</p>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${orderUrl}" class="button">Suivre ma commande</a>
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} EATERZ - Tous droits réservés</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: `✅ EATERZ - Commande ${commande.numero} confirmée`,
    html,
    text: `Votre commande ${commande.numero} a été confirmée. Total: ${commande.total} DZD`
  });
};

/**
 * Email de mise à jour du statut de commande
 */
const sendOrderStatusEmail = async (user, commande, nouveauStatut) => {
  const statusLabels = {
    'en_attente': 'En attente de confirmation',
    'confirmee': 'Confirmée',
    'en_preparation': 'En préparation',
    'prete': 'Prête',
    'en_livraison': 'En cours de livraison',
    'livree': 'Livrée',
    'annulee': 'Annulée'
  };

  const statusEmojis = {
    'en_attente': '⏳',
    'confirmee': '✅',
    'en_preparation': '👨‍🍳',
    'prete': '📦',
    'en_livraison': '🚚',
    'livree': '🎉',
    'annulee': '❌'
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #F98805, #F35695); padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .content { padding: 40px; text-align: center; }
        .status { font-size: 48px; margin: 20px 0; }
        .status-text { font-size: 24px; color: #264414; font-weight: bold; }
        .button { display: inline-block; background: #F98805; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🥗 EATERZ</h1>
        </div>
        <div class="content">
          <p>Bonjour ${user.prenom},</p>
          <p>Votre commande <strong>${commande.numero}</strong> a été mise à jour :</p>
          <div class="status">${statusEmojis[nouveauStatut] || '📋'}</div>
          <div class="status-text">${statusLabels[nouveauStatut] || nouveauStatut}</div>
          <a href="${process.env.FRONTEND_URL}/commandes/${commande.id}" class="button">Voir ma commande</a>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} EATERZ - Tous droits réservés</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject: `${statusEmojis[nouveauStatut]} EATERZ - Commande ${commande.numero}: ${statusLabels[nouveauStatut]}`,
    html,
    text: `Votre commande ${commande.numero} est maintenant: ${statusLabels[nouveauStatut]}`
  });
};

module.exports = {
  verifyConnection,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail
};
