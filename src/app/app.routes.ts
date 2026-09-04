import { Routes } from '@angular/router';
import { HomeComponent } from './home.component';
import { ReviewComponent } from './review.component';
import { HistoryComponent } from './history.component';
import { EventsComponent } from './events.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'review/:id', component: ReviewComponent },
  { path: 'review', redirectTo: '', pathMatch: 'full' },
  { path: 'history', component: HistoryComponent },
  { path: 'events', component: EventsComponent },
  { path: 'events/:id', component: EventsComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
