import React from 'react';
import NavIcon from './NavIcon';
import { mainNavConfig, getAdminMenuItems } from '../config/navIcons';

/**
 * Showcase component demonstrating the modernized NavIcon and navIcons config
 * Beautiful, interactive demonstration of icon animations and styling
 */
export default function IconShowcase() {
  const adminItems = getAdminMenuItems(3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="font-bold text-slate-900 tracking-tight">
            Modern Navigation Icons
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Beautiful, animated icon components with smooth Motion transitions. 
            Hover over any icon to see the elegant spring animation.
          </p>
        </div>

        {/* Main Navigation Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">
              Main Navigation
            </h2>
            <span className="text-sm text-slate-500">
              {mainNavConfig.length} items
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mainNavConfig.map((nav) => (
              <div
                key={nav.path}
                className="group bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-200/60 hover:border-slate-300"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl group-hover:from-blue-50 group-hover:to-indigo-50 transition-colors duration-300">
                    <NavIcon
                      Icon={nav.Icon}
                      colorClass={nav.colorClass}
                      size="default"
                      animate={true}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900 truncate">
                      {nav.label}
                    </h3>
                    <p className="text-sm text-slate-500 truncate">
                      {nav.shortLabel}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {nav.path}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Admin Menu Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">
              Admin Dashboard Menu
            </h2>
            <span className="text-sm text-slate-500">
              {adminItems.length} items
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {adminItems.map((item) => (
              <div
                key={item.id}
                className="group bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-200/60 hover:border-slate-300 relative overflow-hidden"
              >
                {/* Badge */}
                {item.badge !== undefined && (
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium text-white bg-red-500 rounded-full shadow-md">
                      {item.badge}
                    </span>
                  </div>
                )}

                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl group-hover:scale-105 transition-transform duration-300">
                    <NavIcon
                      Icon={item.Icon}
                      colorClass={item.colorClass}
                      size="large"
                      animate={true}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">
                      {item.label}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Size Variants */}
        <section className="space-y-6">
          <h2 className="font-semibold text-slate-800">
            Size Variants
          </h2>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-sm border border-slate-200/60">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center space-y-4">
                <div className="inline-flex p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                  <NavIcon
                    Icon={mainNavConfig[0].Icon}
                    colorClass="text-blue-600"
                    size="small"
                    animate={true}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Small</h3>
                  <p className="text-sm text-slate-500">20×20 pixels</p>
                </div>
              </div>

              <div className="text-center space-y-4">
                <div className="inline-flex p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl">
                  <NavIcon
                    Icon={mainNavConfig[1].Icon}
                    colorClass="text-emerald-600"
                    size="default"
                    animate={true}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Default</h3>
                  <p className="text-sm text-slate-500">24×24 pixels</p>
                </div>
              </div>

              <div className="text-center space-y-4">
                <div className="inline-flex p-4 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl">
                  <NavIcon
                    Icon={mainNavConfig[2].Icon}
                    colorClass="text-violet-600"
                    size="large"
                    animate={true}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Large</h3>
                  <p className="text-sm text-slate-500">32×32 pixels</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Animation States */}
        <section className="space-y-6">
          <h2 className="font-semibold text-slate-800">
            Animation States
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-sm border border-slate-200/60 text-center space-y-4">
              <div className="inline-flex p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                <NavIcon
                  Icon={mainNavConfig[3].Icon}
                  colorClass="text-blue-600"
                  size="large"
                  animate={true}
                />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Animated</h3>
                <p className="text-sm text-slate-500">
                  Smooth hover and tap interactions
                </p>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-sm border border-slate-200/60 text-center space-y-4">
              <div className="inline-flex p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl">
                <NavIcon
                  Icon={mainNavConfig[4].Icon}
                  colorClass="text-slate-600"
                  size="large"
                  animate={false}
                />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Static</h3>
                <p className="text-sm text-slate-500">
                  No animations, pure performance
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-8 border-t border-slate-200">
          <p className="text-sm text-slate-500">
            Built with Motion (formerly Framer Motion) and Lucide React icons
          </p>
        </div>
      </div>
    </div>
  );
}
