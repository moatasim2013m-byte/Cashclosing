import React from 'react';
import DailyClosingForm from './components/DailyClosingForm';
import BirthdayReminders from './components/BirthdayReminders';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <DailyClosingForm />
      <BirthdayReminders />
    </div>
  );
}

export default App;
