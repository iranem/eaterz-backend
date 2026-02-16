
const { User } = require('./models');

async function checkAdmin() {
    try {
        const admin = await User.findOne({ where: { email: 'admin@eaterz.com' } });
        if (admin) {
            console.log('✅ Admin found:', admin.toJSON());
        } else {
            console.log('❌ Admin not found');
        }
    } catch (error) {
        console.error('Error checking admin:', error);
    }
}

checkAdmin();
