/* =====================================================================================
   PIXELGAUNT SETTINGS - EDIT THESE VALUES (used on every page)
   - accounts: your official accounts. Shown ONLY to logged-in users, in the DONATE window
     (every page) and in the Subscription payment steps. An account with an empty number AND
     empty IBAN is hidden automatically. `title` = the account holder name (optional).
   - whatsapp: digits only with country code (0300-1234567 -> 923001234567). Optional.
   ===================================================================================== */
window.PG_CONFIG = {
    whatsapp: '',
    contactEmail: 'pixelgaunt@gmail.com',
    accounts: [
        { key: 'meezan',    name: 'Meezan Bank',  icon: 'pay-meezan.webp',    title: '', number: '99970107234905', iban: 'PK58MEZN0099970107234905' },
        { key: 'easypaisa', name: 'EasyPaisa',    icon: 'pay-easypaisa.webp', title: '', number: '03403886383',    iban: 'PK20TMFB0000000031293826' },
        { key: 'nayapay',   name: 'NayaPay',      icon: 'pay-nayapay.webp',   title: '', number: '03403886383',    iban: 'PK47NAYA1234503403886383' },
        { key: 'alfalah',   name: 'Bank Alfalah', icon: 'pay-alfalah.webp',   title: '', number: '', iban: '' },
        { key: 'sadapay',   name: 'SadaPay',      icon: 'pay-sadapay.webp',   title: '', number: '', iban: '' }
    ]
};
