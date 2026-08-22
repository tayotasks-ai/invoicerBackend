const PDFDocument = require('pdfkit');
const fs = require('fs');

// Helper function to format dates
const formatDateRange = (start, end) => {
  const startDate = new Date(start).toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' });
  const endDate = end ? new Date(end).toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' }) : 'Present';
  return `${startDate} - ${endDate}`;
};

function generateResumePDF(outputPath = './Adejuwon_Tayo_2024_Resume.pdf') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      fs.writeFile(outputPath, pdfBuffer, (err) => {
        if (err) {
          console.error(`Failed to write PDF to ${outputPath}: ${err.message}`);
          reject(new Error(`Failed to write PDF to ${outputPath}: ${err.message}`));
        } else {
          console.log(`PDF successfully written to ${outputPath}`);
          resolve(pdfBuffer);
        }
      });
    });
    doc.on('error', (err) => {
      console.error(`PDF generation error: ${err.message}`);
      reject(err);
    });

    // Page 1
    // Header: Name, Title, and Summary
    doc
      .font('Times-Bold')
      .fontSize(16)
      .fillColor('#000000')
      .text('Adejuwon Tayo', 50, 50, { align: 'center' });

    doc
      .font('Times-Roman')
      .fontSize(12)
      .fillColor('#000000')
      .text('Software Developer', 50, 70, { align: 'center' });

    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(
        'Experienced Software Developer proficient in .NET Core, JavaScript, TypeScript, React, React Native, Node.js, MongoDB, and PostgreSQL. Actively seeking opportunities to expand my skillset and grow in the field of Software Development.',
        50,
        90,
        { align: 'center', width: doc.page.width - 100 }
      );

    // Skills Section
    let yPosition = 130;
    doc
      .font('Times-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('(1) SKILLS', 50, yPosition);

    yPosition += 15;
    const skills = [
      'React', 'C#', 'JavaScript', 'TypeScript', 'React Native',
      'Unity3d', 'Node.js', 'MongoDB', 'PostgreSQL', 'Go'
    ];
    skills.forEach((skill) => {
      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#000000')
        .text(skill, 60, yPosition);
      yPosition += 15;
    });

    // Work Experience Section
    yPosition += 10;
    doc
      .font('Times-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('WORK EXPERIENCE', 50, yPosition);

    yPosition += 15;

    // Melon - Backend Developer
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Backend Developer', 60, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Melon', 60, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(formatDateRange('2022-06-01', null), 400, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Lagos, Nigeria', 400, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('fulltime', 400, yPosition + 30);

    yPosition += 45;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Achievements', 70, yPosition);
    yPosition += 15;
    const melonAchievements = [
      'Built and managed the Authentication Service and User Service using multitenancy principles using Node.js.',
      'Built and managed the Data collection and analysis Service of the platform.',
      'Built and managed the Dynamic Form mechanism allowing organizations customize their own forms for data collection.'
    ];
    melonAchievements.forEach((achievement) => {
      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#000000')
        .text(`- ${achievement}`, 80, yPosition, { width: doc.page.width - 130 });
      yPosition += 20;
    });

    // Chapel Hill Denham - Backend Developer
    yPosition += 10;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Backend Developer', 60, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Chapel Hill Denham', 60, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(formatDateRange('2021-12-01', '2022-06-01'), 400, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Lagos, Nigeria', 400, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('fulltime', 400, yPosition + 30);

    yPosition += 45;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Achievements', 70, yPosition);
    yPosition += 15;
    const chapelAchievements = [
      'Converted existing monolith Fund App to microservice applications using TypeScript Node.js.',
      'Built and managed the Learning Management system that provides video, audio, and written content for Invest Naija.',
      'Built and managed the entire Notification system for Invest Naija which includes emailing and push notifications.',
      'Integrated successfully with third-party services for Identity checks, payments, and regulatory profiling, such as CSCS, NIBSS, Paystack, etc. in Invest Naija and Fund App.',
      'Developed and deployed comprehensive APIs for the Invest Naija admin dashboard, enabling internal stakeholders to monitor and manage operations, utilizing Node.js for robust backend functionality.',
      'Rebuilt and managed the Fund App to enable sales of investment assets such as Federal Government Savings Bond (FGNSB), Money Market Fund (MMF), etc. This application saw a retail purchase of a billion Naira.'
    ];
    chapelAchievements.forEach((achievement) => {
      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#000000')
        .text(`- ${achievement}`, 80, yPosition, { width: doc.page.width - 130 });
      yPosition += 20;
    });

    // Squad Payments - Backend Developer
    yPosition += 10;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Backend Developer', 60, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Squad Payments', 60, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(formatDateRange('2021-01-01', '2021-12-01'), 400, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Lagos, Nigeria', 400, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('fulltime', 400, yPosition + 30);

    yPosition += 45;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Achievements', 70, yPosition);
    yPosition += 15;
    const squadAchievements = [
      'Built an Engine which could process payments via cards, USSD, and bank transfers in ASP.NET.',
      'Integrated with third-party services such as Interswitch, Cybersource, and MPGS to enable card payments and CoralPay for USSD payments.',
      'Developed and launched the settlement and payout services that enabled automated settlement for merchants to receive their collections.',
      'Built the Recurring Payment Module of the Payment Gateway including its scheduler using ASP.NET Core.',
      'Built the intelligent picker service that picks the appropriate payment gateway for each transaction based on certain criteria to help reduce cost.'
    ];
    squadAchievements.forEach((achievement) => {
      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#000000')
        .text(`- ${achievement}`, 80, yPosition, { width: doc.page.width - 130 });
      yPosition += 20;
    });

    // Page Number
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Page 1 of 2', 50, doc.page.height - 50, { align: 'center' });

    // Page 2
    doc.addPage();
    yPosition = 50;

    // Work Experience (continued)
    doc
      .font('Times-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('WORK EXPERIENCE', 50, yPosition);

    yPosition += 15;

    // Guaranty Trust Bank - Systems/Software Developer
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Systems/Software Developer (Fintech and Innovation Division)', 60, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Guaranty Trust Bank', 60, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(formatDateRange('2018-10-01', '2021-01-01'), 400, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Lagos, Nigeria', 400, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('fulltime', 400, yPosition + 30);

    yPosition += 45;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Achievements', 70, yPosition);
    yPosition += 15;
    const gtbAchievements = [
      'Integrated and deployed Orange Books to the Active Directory of the bank to enable staff authentication using Node.js and C#.',
      'Built the front end and backend of Sound Wallet - a prototype mobile application that made bank operations possible over sound waves operations such as bank transfers and withdrawals from ATMs using React Native and Node.js.',
      'Built inventory management system using Sound Wallet as Point of Sales Terminals using Node.js and React Native.',
      'Built the mobile application VIVA, an event planning platform using React Native. I was vital in building the mobile side of a SaaS called Clockr using React Native and Node.js for the backend using multitenancy to accommodate multiple organizations on the platform.',
      'Developed and deployed GT Assistant, a trainable HR chatbot to assist staff with navigating work-related tasks and information using Next.js and Node.js.',
      'Developed an e-invoice Gmail extension using Google Apps Script to enable bank customers to send out invoices from their emails.'
    ];
    gtbAchievements.forEach((achievement) => {
      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#000000')
        .text(`- ${achievement}`, 80, yPosition, { width: doc.page.width - 130 });
      yPosition += 20;
    });

    // Achievements Section
    yPosition += 15;
    doc
      .font('Times-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('(A) ACHIEVEMENTS', 50, yPosition);

    yPosition += 15;
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Award of Excellence', 60, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Prestigious Award in Guaranty Trust Bank', 70, yPosition + 15);

    // Education Section
    yPosition += 35;
    doc
      .font('Times-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('EDUCATION', 50, yPosition);

    yPosition += 15;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Bachelors in Engineering', 60, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Federal University of Agriculture Abeokuta', 60, yPosition + 15);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(formatDateRange('2011-01-01', '2017-01-01'), 400, yPosition);
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Abeokuta, Ogun', 400, yPosition + 15);

    yPosition += 35;
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text('Courses', 70, yPosition);
    yPosition += 15;
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('- Electrical and Electronics Engineering', 80, yPosition);

    // Personal Projects Section
    yPosition += 25;
    doc
      .font('Times-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('(A) PERSONAL PROJECTS', 50, yPosition);

    yPosition += 15;
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(`Praygram (${formatDateRange('2022-06-01', null)})`, 60, yPosition);
    yPosition += 15;
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('- A platform for Christians to fellowship online', 70, yPosition);

    yPosition += 25;
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text(`PartyLynx (${formatDateRange('2024-04-01', null)})`, 60, yPosition);
    yPosition += 15;
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('- The platform consolidates images from multiple cameras into a single, unified album, ensuring comprehensive event coverage from various perspectives.', 70, yPosition, { width: doc.page.width - 120 });

    // Interests Section
    yPosition += 25;
    doc
      .font('Times-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text('(B) INTERESTS', 50, yPosition);

    yPosition += 15;
    const interests = ['chess', 'Music', 'basketball', 'video games'];
    interests.forEach((interest) => {
      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#000000')
        .text(interest, 60, yPosition);
      yPosition += 15;
    });

    // Page Number
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor('#000000')
      .text('Page 2 of 2', 50, doc.page.height - 50, { align: 'center' });

    // Finalize the PDF
    doc.end();
  });
}

// Example usage: Call the function to generate and save the PDF
generateResumePDF()
  .then(() => {
    console.log('Resume PDF generation completed.');
  })
  .catch((err) => {
    console.error('Error generating resume PDF:', err);
  });