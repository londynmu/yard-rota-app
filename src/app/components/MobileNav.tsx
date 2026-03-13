import { useState } from 'react';
import { Menu, X, Home, ClipboardList, TrendingUp, CheckSquare, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  const navItems = [
    { icon: Home, label: 'Home', active: true },
    { icon: ClipboardList, label: 'My Rota', active: false },
    { icon: TrendingUp, label: 'Performance', active: false },
    { icon: CheckSquare, label: 'PreCheck', active: false },
    { icon: Settings, label: 'Admin Panel', active: false },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="lg:hidden">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[350px]">
        <div className="flex flex-col gap-2 mt-8">
          {navItems.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              className={`justify-start ${
                item.active ? 'bg-blue-50 text-blue-700' : ''
              }`}
              onClick={() => setOpen(false)}
            >
              <item.icon className="size-5 mr-3" />
              {item.label}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
