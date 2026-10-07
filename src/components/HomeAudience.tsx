import { useState } from 'react';
import { ArrowUpRight, Check, GraduationCap, School, Users } from 'lucide-react';

type AuthRole = 'student' | 'faculty' | 'college' | 'recruiter';
const audiences = [
  { id: 'student', label: 'Students', icon: GraduationCap, heading: 'Build something you’re proud of.', description: 'A focused place to organize your project, collaborate with your team, and turn your progress into a portfolio.', features: ['Project planning & team collaboration', 'Milestone submissions & mentor feedback', 'Blackbook reports & portfolio exports'], cta: 'Start your student workspace', mode: 'signup', tag: 'YOUR NEXT BIG IDEA', scene: ['Plan your project', 'Build with your team', 'Present your work'] },
  { id: 'faculty', label: 'Mentors', icon: Users, heading: 'Guide the work. See the progress.', description: 'Stay close to your assigned teams with a clear review queue, visible milestones, and feedback where it matters.', features: ['Assigned projects & team visibility', 'Evidence-based milestone reviews', 'Feedback, revision requests & scores'], cta: 'Sign in as a mentor', mode: 'signin', tag: 'A CLEARER VIEW OF PROGRESS', scene: ['Review submissions', 'Share focused feedback', 'Help teams move forward'] },
  { id: 'college', label: 'Institutions', icon: School, heading: 'Bring the bigger picture into focus.', description: 'Connect academic project work with institution-managed access, mentoring assignments, and workspace-wide visibility.', features: ['Administrator-managed account access', 'Project oversight & mentor assignment', 'Delivery analytics & activity monitoring'], cta: 'Sign in to your institution', mode: 'signin', tag: 'CONNECTED ACADEMIC OPERATIONS', scene: ['Connect your people', 'Coordinate project work', 'Understand delivery'] },
] as const;

export default function HomeAudience({ onOpenAuth }: { onOpenAuth: (mode: 'signin' | 'signup', role?: AuthRole) => void }) {
  const [selected, setSelected] = useState<AuthRole>('student');
  const current = audiences.find(item => item.id === selected)!;
  const Icon = current.icon;

  return <section id="your-workspace" className="home-section home-audience" aria-labelledby="home-audience-title"><div className="home-container">
    <div className="home-audience-heading"><div className="home-section-heading"><span className="home-eyebrow">Your role. Your rhythm.</span><h2 id="home-audience-title">A shared platform.<br /><span>A space that feels like yours.</span></h2></div><div className="home-audience-switch" aria-label="Choose your workspace">{audiences.map(({ id, label, icon: RoleIcon }) => <button key={id} aria-pressed={selected === id} onClick={() => setSelected(id)}><RoleIcon size={16} />{label}</button>)}</div></div>
    <div className="home-audience-panel">
      <div className="home-audience-copy"><span className="home-eyebrow">For {current.label.toLowerCase()}</span><h3>{current.heading}</h3><p>{current.description}</p><ul>{current.features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul><button className="home-button home-button-primary" onClick={() => onOpenAuth(current.mode, current.id)}>{current.cta}<ArrowUpRight size={17} /></button>{selected !== 'student' && <small className="home-audience-access">Teacher, staff, and administrator access is assigned by your institution.</small>}</div>
      <div className={`home-audience-scene home-audience-scene-${selected}`} aria-label={`${current.label} workspace highlights`}>
        <div className="home-audience-scene-grid" aria-hidden="true" /><div className="home-audience-scene-top"><span><span className="home-live-dot" />{current.label} workspace</span><span>PLACEPMS / CONNECTED</span></div>
        <span className="home-audience-scene-icon"><Icon size={35} /></span><span className="home-eyebrow">{current.tag}</span>
        <div className="home-audience-scene-steps">{current.scene.map((label, index) => <div key={label}><span>0{index + 1}</span><strong>{label}</strong><Check size={13} /></div>)}</div>
        <div className="home-audience-scene-bottom"><span>People → Projects → Possibility</span><span aria-hidden="true"><i /><i /><i /></span></div>
      </div>
    </div>
  </div></section>;
}
