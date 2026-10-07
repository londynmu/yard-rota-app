import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Copy, 
  Trash2,
  Home,
  ClipboardList,
  TrendingUp,
  CheckSquare,
  Settings,
  Bell,
  User
} from 'lucide-react';
import { DayColumn } from './components/DayColumn';
import { MobileNav } from './components/MobileNav';
import { Button } from './components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';

// Mock data based on the screenshot
const weekData = [
  {
    dayName: 'SOB',
    date: '7 MAR',
    isToday: false,
    shifts: [
      {
        timeRange: '05:45 - 16:00',
        assigned: 7,
        needed: 16,
        employees: [
          { name: 'Marius Moise', id: '1' },
          { name: 'Mike Bailey', id: '2' },
          { name: 'Alex Ribeiro', id: '3' },
          { name: 'Harjit Dulay', id: '4' },
          { name: 'Andrew Wilkinson', id: '5' },
          { name: 'Mahesh Kandemulle', id: '6' },
          { name: 'Marcin Kuzminski', id: '7' },
        ],
      },
      {
        timeRange: '15:45 - 02:00',
        assigned: 12,
        needed: 17,
        employees: [
          { name: 'Jeremy Jones', id: '8' },
          { name: 'Pavel Lukas', id: '9' },
          { name: 'Lee Addison', id: '10' },
          { name: 'Isaac Vargane', id: '11' },
          { name: 'Tomas Jacko', id: '12' },
          { name: 'Aleksander Kniat', id: '13' },
          { name: 'Khodian Arao', id: '14' },
          { name: 'Manvir Walia', id: '15' },
          { name: 'David Glover', id: '16' },
          { name: 'Michal Warda', id: '17' },
          { name: 'Bojan Nikolic', id: '18' },
          { name: 'Stefan Teslafeld', id: '19' },
        ],
      },
    ],
  },
  {
    dayName: 'NIE',
    date: '8 MAR',
    isToday: false,
    shifts: [
      {
        timeRange: '01:00 - 13:00',
        assigned: 1,
        needed: 1,
        employees: [{ name: 'Parviz Khoshnegah', id: '20' }],
      },
      {
        timeRange: '05:45 - 18:15',
        assigned: 10,
        needed: 15,
        employees: [
          { name: 'Marius Moise', id: '21' },
          { name: 'Rich White', id: '22' },
          { name: 'Harjit Dulay', id: '23' },
          { name: 'Bogdan Gal', id: '24' },
          { name: 'Daniel A Spiridon', id: '25' },
          { name: 'Kevin Nethercot', id: '26' },
          { name: 'Pawel Nowosielski', id: '27' },
          { name: 'Mahesh Kandemulle', id: '28' },
          { name: 'Illyas Rashid', id: '29' },
          { name: 'Steven Stokes', id: '30' },
        ],
      },
      {
        timeRange: '16:45 - 05:00',
        assigned: 0,
        needed: 1,
        employees: [],
        isEmpty: true,
      },
    ],
  },
  {
    dayName: 'MON',
    date: 'MAR 9',
    isToday: false,
    shifts: [
      {
        timeRange: '04:00 - 17:00',
        assigned: 1,
        needed: 1,
        employees: [{ name: 'Parviz Khoshnegah', id: '31' }],
      },
      {
        timeRange: '05:00 - 17:30',
        assigned: 2,
        needed: 6,
        employees: [
          { name: 'Bogdan Gal', id: '32' },
          { name: 'Kevin Nethercot', id: '33' },
        ],
      },
      {
        timeRange: '05:45 - 18:00',
        assigned: 10,
        needed: 12,
        employees: [
          { name: 'Andy Godson', id: '34' },
          { name: 'Rich White', id: '35' },
          { name: 'Dinu Lasconi', id: '36' },
          { name: 'Daniel A Spiridon', id: '37' },
          { name: 'Radu Spiridon', id: '38' },
          { name: 'Vasile Mihai', id: '39' },
          { name: 'Ashvinder Khuman', id: '40' },
          { name: 'Pawel Nowosielski', id: '41' },
          { name: 'Illyas Rashid', id: '42' },
          { name: 'Steven Stokes', id: '43' },
        ],
      },
    ],
  },
  {
    dayName: 'WT',
    date: '10 MAR',
    isToday: false,
    shifts: [
      {
        timeRange: '04:00 - 17:00',
        assigned: 1,
        needed: 1,
        employees: [{ name: 'Parviz Khoshnegah', id: '44' }],
      },
      {
        timeRange: '05:00 - 17:30',
        assigned: 2,
        needed: 7,
        employees: [
          { name: 'Bogdan Gal', id: '45' },
          { name: 'Kevin Nethercot', id: '46' },
        ],
      },
      {
        timeRange: '05:45 - 18:15',
        assigned: 12,
        needed: 15,
        employees: [
          { name: 'Andy Godson', id: '47' },
          { name: 'Mike Bailey', id: '48' },
          { name: 'Rich White', id: '49' },
          { name: 'Alex Ribeiro', id: '50' },
          { name: 'Andrew Wilkinson', id: '51' },
          { name: 'Dinu Lasconi', id: '52' },
          { name: 'Daniel A Spiridon', id: '53' },
          { name: 'Steve Tebbutt', id: '54' },
          { name: 'Radu Spiridon', id: '55' },
          { name: 'Vasile Mihai', id: '56' },
          { name: 'Ashvinder Khuman', id: '57' },
          { name: 'Mahesh Kandemulle', id: '58' },
        ],
      },
    ],
  },
  {
    dayName: 'ŚR',
    date: '11 MAR',
    isToday: false,
    shifts: [
      {
        timeRange: '04:00 - 17:00',
        assigned: 1,
        needed: 1,
        employees: [{ name: 'Parviz Khoshnegah', id: '59' }],
      },
      {
        timeRange: '05:00 - 17:30',
        assigned: 2,
        needed: 10,
        employees: [
          { name: 'Bogdan Gal', id: '60' },
          { name: 'Kevin Nethercot', id: '61' },
        ],
      },
      {
        timeRange: '05:45 - 18:15',
        assigned: 12,
        needed: 15,
        employees: [
          { name: 'Marius Moise', id: '62' },
          { name: 'Mike Bailey', id: '63' },
          { name: 'Rich White', id: '64' },
          { name: 'Alex Ribeiro', id: '65' },
          { name: 'Andrew Wilkinson', id: '66' },
          { name: 'Dinu Lasconi', id: '67' },
          { name: 'Daniel A Spiridon', id: '68' },
          { name: 'Steve Tebbutt', id: '69' },
          { name: 'Radu Spiridon', id: '70' },
          { name: 'Vasile Mihai', id: '71' },
          { name: 'Bogdan Nowosielski', id: '72' },
          { name: 'Illyas Rashid', id: '73' },
        ],
      },
    ],
  },
  {
    dayName: 'CZW',
    date: '12 MAR',
    isToday: false,
    shifts: [
      {
        timeRange: '04:00 - 17:00',
        assigned: 1,
        needed: 1,
        employees: [{ name: 'Parviz Khoshnegah', id: '74' }],
      },
      {
        timeRange: '05:00 - 17:30',
        assigned: 2,
        needed: 6,
        employees: [
          { name: 'Bogdan Gal', id: '75' },
          { name: 'Kevin Nethercot', id: '76' },
        ],
      },
      {
        timeRange: '05:45 - 18:15',
        assigned: 12,
        needed: 15,
        employees: [
          { name: 'Marius Moise', id: '77' },
          { name: 'Mike Bailey', id: '78' },
          { name: 'Rich White', id: '79' },
          { name: 'Alex Ribeiro', id: '80' },
          { name: 'Andrew Wilkinson', id: '81' },
          { name: 'Dinu Lasconi', id: '82' },
          { name: 'Daniel A Spiridon', id: '83' },
          { name: 'Steve Tebbutt', id: '84' },
          { name: 'Radu Spiridon', id: '85' },
          { name: 'Vasile Mihai', id: '86' },
          { name: 'Mahesh Kandemulle', id: '87' },
          { name: 'Steven Stokes', id: '88' },
        ],
      },
    ],
  },
  {
    dayName: 'FRI',
    date: 'MAR 13',
    isToday: true,
    shifts: [
      {
        timeRange: '05:00 - 14:15',
        assigned: 0,
        needed: 1,
        employees: [],
        isEmpty: true,
      },
      {
        timeRange: '05:00 - 17:15',
        assigned: 2,
        needed: 6,
        employees: [
          { name: 'Alex Ribeiro', id: '89' },
          { name: 'Kevin Nethercot', id: '90' },
        ],
      },
      {
        timeRange: '05:45 - 18:15',
        assigned: 11,
        needed: 13,
        employees: [
          { name: 'Marius Moise', id: '91' },
          { name: 'Mike Bailey', id: '92' },
          { name: 'Andrew Wilkinson', id: '93' },
          { name: 'Dinu Lasconi', id: '94' },
          { name: 'Steve Tebbutt', id: '95' },
          { name: 'Radu Spiridon', id: '96' },
          { name: 'Vasile Mihai', id: '97' },
          { name: 'Ashvinder Khuman', id: '98' },
          { name: 'Mahesh Kandemulle', id: '99' },
          { name: 'Steven Stokes', id: '100' },
          { name: 'Bogdan Gal', id: '101' },
        ],
      },
    ],
  },
];

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <MobileNav />
              <div className="flex items-center gap-2">
                <div className="size-8 sm:size-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <Calendar className="size-4 sm:size-6 text-white" />
                </div>
                <div>
                  <h1 className="text-base sm:text-xl font-bold text-gray-900">Shutters.net</h1>
                  <p className="text-xs text-gray-500 hidden sm:block">Shift Management System</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Bell className="size-4" />
              </Button>
              <Button variant="outline" size="sm">
                <User className="size-4" />
              </Button>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" className="bg-blue-50 text-blue-700">
              <Home className="size-4 mr-2" />
              Home
            </Button>
            <Button variant="ghost" size="sm">
              <ClipboardList className="size-4 mr-2" />
              My Rota
            </Button>
            <Button variant="ghost" size="sm">
              <TrendingUp className="size-4 mr-2" />
              Performance
            </Button>
            <Button variant="ghost" size="sm">
              <CheckSquare className="size-4 mr-2" />
              PreCheck
            </Button>
            <Button variant="ghost" size="sm">
              <Settings className="size-4 mr-2" />
              Admin Panel
            </Button>
          </nav>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Select defaultValue="rugby">
                <SelectTrigger className="w-[140px] sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rugby">Rugby</SelectItem>
                  <SelectItem value="football">Football</SelectItem>
                  <SelectItem value="basketball">Basketball</SelectItem>
                </SelectContent>
              </Select>

              <Select defaultValue="week">
                <SelectTrigger className="w-[110px] sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="sm" className="min-w-[90px] sm:min-w-[120px]">
                  Week 11
                </Button>
                <Button variant="outline" size="sm">
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                Current Week
              </Button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" className="flex-1 sm:flex-initial">
                <Copy className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Copy Last Week</span>
              </Button>
              <Button variant="outline" size="sm">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Calendar Grid */}
      <main className="p-3 sm:p-6">
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4">
          {weekData.map((day, index) => (
            <DayColumn key={index} {...day} />
          ))}
        </div>
      </main>
    </div>
  );
}