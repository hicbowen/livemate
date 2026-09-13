package sqlite

import (
	"reflect"
	"testing"

	"github.com/hicbowen/livemate/internal/domain"
)

func TestTodoTasksRoundTripAndDateIsolation(t *testing.T) {
	store := testStore(t)
	want := []domain.TodoTask{
		{ID: "first", Text: "整理复盘", Completed: false, TimeRange: []string{"09:00", "10:00"}, StartReminderEnabled: true},
		{ID: "second", Text: "跟进方案", Completed: true, TimeRange: []string{}},
	}
	if err := store.ReplaceTodoTasks("2026-09-11", want); err != nil {
		t.Fatal(err)
	}
	got, err := store.GetTodoTasks("2026-09-11")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("tasks = %#v, want %#v", got, want)
	}
	other, err := store.GetTodoTasks("2026-09-12")
	if err != nil {
		t.Fatal(err)
	}
	if len(other) != 0 {
		t.Fatalf("tasks leaked to another date: %#v", other)
	}
	reminders, err := store.GetTodoReminderTasks()
	if err != nil {
		t.Fatal(err)
	}
	if len(reminders) != 1 || reminders[0].Date != "2026-09-11" || reminders[0].Task.ID != "first" {
		t.Fatalf("reminders = %#v", reminders)
	}
	if err := store.SetTodoStartReminder("2026-09-11", "first", false); err != nil {
		t.Fatal(err)
	}
	reminders, err = store.GetTodoReminderTasks()
	if err != nil {
		t.Fatal(err)
	}
	if len(reminders) != 0 {
		t.Fatalf("reminders after disable = %#v", reminders)
	}
}

func TestTodoTasksRejectInvalidSnapshots(t *testing.T) {
	store := testStore(t)
	cases := []struct {
		name  string
		date  string
		tasks []domain.TodoTask
	}{
		{name: "invalid date", date: "20260911", tasks: nil},
		{name: "empty id", date: "2026-09-11", tasks: []domain.TodoTask{{Text: "任务"}}},
		{name: "invalid time range", date: "2026-09-11", tasks: []domain.TodoTask{{ID: "1", Text: "任务", TimeRange: []string{"09:00"}}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := store.ReplaceTodoTasks(tc.date, tc.tasks); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}
